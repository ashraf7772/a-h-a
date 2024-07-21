/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./App.scss";

import type { ScreenViewport, IModelConnection } from "@itwin/core-frontend";
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
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Auth } from "./Auth";
import { history } from "./history";
import { QueryRowFormat } from "@itwin/core-common";

const App: React.FC = () => {
  const [iModelId, setIModelId] = useState(process.env.IMJS_IMODEL_ID);
  const [iTwinId, setITwinId] = useState(process.env.IMJS_ITWIN_ID);
  const [changesetId, setChangesetId] = useState(
    process.env.IMJS_AUTH_CLIENT_CHANGESET_ID
  );

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

  const viewConfiguration = useCallback((viewPort: ScreenViewport) => {
    const tileTreesLoaded = () => {
      return new Promise((resolve, reject) => {
        const start = new Date();
        const intvl = setInterval(() => {
          if (viewPort.areAllTileTreesLoaded) {
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
      void IModelApp.tools.run(FitViewTool.toolId, viewPort, true, false);
      viewPort.view.setStandardRotation(StandardViewId.Iso);
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

  const onIModelConnected = (_imodel: IModelConnection) => {
    console.log("Hello World");

    IModelApp.viewManager.onViewOpen.addOnce(async (vp: ScreenViewport) => {
      

      const cToHide: string[] = [
        "'Geom_Baseline'",
        "'TC_Aggregate'",
        "'TC_Grass'",
        "'TC_Rail Ballast'",
        "'TC_Rail Conc Sleeper'",
        "'TC_Rail Subballast'",
        "'TL_Rail Subballast'",
        "'TL_Rail Ballast'",
        "'Default'",
        "'S-PILE-CONC'",
        "'S-WALL-CONC'",
        "'A-GLAZ'",
        "'A-GLAZ-CLER'",
        "'A-HRAL-MWRK'",
        "'ARC01'",
        "'S-BEAM'",
        "'S-BEAM-STEL-PRI'",
        "'S-COLS'",
        "'S-JOIS-ENVL'",
        "'S-SLAB-CONC'",
        "'C-RAIL-EQPM'",
        "'A-WALL-BLOC'",
        "'A-WALL-LINE'",
        "'A-WALL-METL'",
        "'A-WALL-STUD'",
        "'A-WALL-TPAR'",
        "'S-COLS-FRAM'",
        "'S-SLAB-CONC'",
        "'S-BEAM'",
        "'S-BEAM-CONC'",
        "'S-COLS-CONC'",
        "'A-CLNG-TILE'",
      ];
      const query = `SELECT ECInstanceId FROM Bis.Category 
   WHERE CodeValue IN (${cToHide.toString()})`;

      const result = _imodel.query(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
      const categoryIds = [];

      for await (const row of result) 
        categoryIds.push(row.id);

      console.log(categoryIds);
      vp.changeCategoryDisplay(categoryIds, false);
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
