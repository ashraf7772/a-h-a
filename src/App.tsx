import React, { useState, useCallback, useEffect, useMemo } from "react";
import { ScreenViewport, IModelConnection, Marker, MarkerSet, Cluster, Decorator, DecorateContext } from "@itwin/core-frontend";
import { Point3d } from "@itwin/core-geometry";
import { FitViewTool, IModelApp, StandardViewId } from "@itwin/core-frontend";
import { FillCentered } from "@itwin/core-react";
import { ProgressLinear, ThemeProvider } from "@itwin/itwinui-react";
import {
  MeasurementActionToolbar,
  MeasureTools,
  MeasureToolsUiItemsProvider,
} from "@itwin/measure-tools-react";
import {
  AncestorsNavigationControls,
  CopyPropertyTextContextMenuItem,
  PropertyGridManager,
  PropertyGridUiItemsProvider,
  ShowHideNullValuesSettingsMenuItem,
} from "@itwin/property-grid-react";
import {
  TreeWidget,
  TreeWidgetUiItemsProvider,
} from "@itwin/tree-widget-react";
import {
  useAccessToken,
  Viewer,
  ViewerContentToolsProvider,
  ViewerNavigationToolsProvider,
  ViewerPerformance,
  ViewerStatusbarItemsProvider,
} from "@itwin/web-viewer-react";

import { Auth } from "./Auth";
import { history } from "./history";
import { Visualization } from "./Visualization";
import { DisplayStyleSettingsProps } from "@itwin/core-common";
import { PassengerDataApi } from "./PassengerDataAPI";
import "./App.scss";

class MyMarkerSet extends MarkerSet<Marker> implements Decorator {
  constructor(viewport: ScreenViewport) {
    super(viewport);
  }

  protected getClusterMarker(cluster: Cluster<Marker>): Marker {
    if (cluster.markers.length > 0) {
      return cluster.markers[0];
    }

    if (!this.viewport) {
      throw new Error("Viewport is undefined. Cannot create a Marker.");
    }

    const clusterLocation = cluster.getClusterLocation();
    const clusterPoint = new Point3d(clusterLocation.x, clusterLocation.y, clusterLocation.z);
    const defaultMarker = new Marker(clusterPoint, { x: 32, y: 32 });
    defaultMarker.label = "Cluster";
    return defaultMarker;
  }

  addMarker(marker: Marker): void {
    this.markers.add(marker); // Utilizing the inherited `markers` Set property
  }

  // Corrected method using DecorateContext
  decorate(context: DecorateContext): void {
    for (const marker of this.markers) {
      marker.addDecoration(context);
    }
  }
}


const App: React.FC = () => {
  const [iModelId, setIModelId] = useState(process.env.IMJS_IMODEL_ID);
  const [iTwinId, setITwinId] = useState(process.env.IMJS_ITWIN_ID);
  const [changesetId, setChangesetId] = useState(process.env.IMJS_AUTH_CLIENT_CHANGESET_ID);

  const accessToken = useAccessToken();

  const authClient = Auth.getClient();

  const login = useCallback(async () => {
    try {
      await authClient.signInSilent();
    } catch {
      await authClient.signIn();
    }
  }, [authClient]);

  useEffect(() => {
    void login();
  }, [login]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("iTwinId")) {
      setITwinId(urlParams.get("iTwinId") as string);
    }
    if (urlParams.has("iModelId")) {
      setIModelId(urlParams.get("iModelId") as string);
    }
    if (urlParams.has("changesetId")) {
      setChangesetId(urlParams.get("changesetId") as string);
    }
  }, []);

  useEffect(() => {
    let url = `viewer?iTwinId=${iTwinId}`;

    if (iModelId) {
      url = `${url}&iModelId=${iModelId}`;
    }

    if (changesetId) {
      url = `${url}&changesetId=${changesetId}`;
    }
    history.push(url);
  }, [iTwinId, iModelId, changesetId]);

  const viewConfiguration = useCallback((viewport: ScreenViewport) => {
    const tileTreesLoaded = () => {
      return new Promise((resolve, reject) => {
        const start = new Date();
        const intvl = setInterval(() => {
          if (viewport.areAllTileTreesLoaded) {
            ViewerPerformance.addMark("TilesLoaded");
            ViewerPerformance.addMeasure(
              "TileTreesLoaded",
              "ViewerStarting",
              "TilesLoaded"
            );
            clearInterval(intvl);
            resolve(true);
          }
          const now = new Date();
          if (now.getTime() - start.getTime() > 20000) {
            reject();
          }
        }, 100);
      });
    };

    tileTreesLoaded().finally(() => {
      void IModelApp.tools.run(FitViewTool.toolId, viewport, true, false);
      viewport.view.setStandardRotation(StandardViewId.Iso);
    });
  }, []);

  const viewCreatorOptions = useMemo(
    () => ({ viewportConfigurer: viewConfiguration }),
    [viewConfiguration]
  );

  const onIModelAppInit = useCallback(async () => {
    await TreeWidget.initialize();
    await PropertyGridManager.initialize();
    await MeasureTools.startup();
    MeasurementActionToolbar.setDefaultActionProvider();
  }, []);

  const addPlaneMarker = (viewport: ScreenViewport) => {
    const markers = new MyMarkerSet(viewport);
    const planeCoordinates = new Point3d(-4.67, -3.06, 10.07);

    const marker = new Marker(planeCoordinates, { x: 32, y: 32 });
    marker.label = "Plane";
    marker.setScaleFactor({ low: 1.0, high: 1.0 });
    marker.imageOffset = { x: 0, y: 0 };
    marker.imageSize = { x: 32, y: 32 };
    marker.labelOffset = { x: 0, y: -20 };
    marker.visible = true;

    markers.addMarker(marker);

    IModelApp.viewManager.addDecorator(markers);
  };

  const onIModelConnected = (imodel: IModelConnection) => {
    IModelApp.viewManager.onViewOpen.addOnce(async (vp: ScreenViewport) => {
      const viewStyle: DisplayStyleSettingsProps = {
        viewflags: {
          visEdges: false,
          shadows: false,
        },
      };

      vp.overrideDisplayStyle(viewStyle);
      console.log(await PassengerDataApi.getData());
      await Visualization.hideHouseExterior(vp, imodel);

      addPlaneMarker(vp);
    });
  };

  return (
    <div className="viewer-container">
      {!accessToken && (
        <FillCentered>
          <div className="signin-content">
            <ProgressLinear indeterminate={true} labels={["Signing in..."]} />
          </div>
        </FillCentered>
      )}
      <ThemeProvider theme="dark">
        <Viewer
          iTwinId={iTwinId ?? ""}
          iModelId={iModelId ?? ""}
          changeSetId={changesetId}
          authClient={authClient}
          viewCreatorOptions={viewCreatorOptions}
          enablePerformanceMonitors={true}
          onIModelAppInit={onIModelAppInit}
          onIModelConnected={onIModelConnected}
          uiProviders={[
            new ViewerNavigationToolsProvider(),
            new ViewerContentToolsProvider({
              vertical: {
                measureGroup: false,
              },
            }),
            new ViewerStatusbarItemsProvider(),
            new TreeWidgetUiItemsProvider(),
            new PropertyGridUiItemsProvider({
              propertyGridProps: {
                autoExpandChildCategories: true,
                ancestorsNavigationControls: (props) => (
                  <AncestorsNavigationControls {...props} />
                ),
                contextMenuItems: [
                  (props) => <CopyPropertyTextContextMenuItem {...props} />,
                ],
                settingsMenuItems: [
                  (props) => (
                    <ShowHideNullValuesSettingsMenuItem
                      {...props}
                      persist={true}
                    />
                  ),
                ],
              },
            }),
            new MeasureToolsUiItemsProvider(),
          ]}
        />
      </ThemeProvider>
    </div>
  );
};

export default App;
