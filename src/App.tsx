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
import "./App.scss";

// TimerPopup component (already correct in your code)
interface TimerPopupProps {
  startTime: number; // Start time in seconds
  onClose: () => void;
}

const TimerPopup: React.FC<TimerPopupProps> = ({ startTime, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(startTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timer); // Cleanup the timer on component unmount
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      onClose();
    }
  }, [timeLeft, onClose]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="timer-popup">
      <h3>Remaining time until flight</h3>
      <p>{formatTime(timeLeft)}</p>
      <button onClick={onClose}>Close</button>
    </div>
  );
};

// BagScanPopup component
const BagScanPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="bag-scan-popup">
      <h3>Baggage Area</h3>
      <button onClick={onClose}>Simulate Bag Scan</button>
    </div>
  );
};

// MyMarkerSet class implementation (already correct in your code)
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

  decorate(context: DecorateContext): void {
    for (const marker of this.markers) {
      marker.addDecoration(context);
    }
  }
}

const App: React.FC = () => {

  const playAlarmSound = () => {
    const alarmSound = new Audio('/sounds/mixkit-classic-alarm-995.wav'); // Path to your .wav file
    alarmSound.play();  // Play the sound
  };

  const triggerFireAlarm = () => {
    playAlarmSound();  // Play the alarm sound
    alert("Fire alarm triggered! Evacuate the area immediately.");  // Additional action
  };


  const [iModelId, setIModelId] = useState(process.env.IMJS_IMODEL_ID);
  const [iTwinId, setITwinId] = useState(process.env.IMJS_ITWIN_ID);
  const [changesetId, setChangesetId] = useState(process.env.IMJS_AUTH_CLIENT_CHANGESET_ID);
  const [showPopup, setShowPopup] = useState(false);
  const [showBagScanPopup, setShowBagScanPopup] = useState(false); // State for BagScanPopup

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

  const addPlaneMarker = (viewport: ScreenViewport, setPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
    const markers = new MyMarkerSet(viewport);
    const planeCoordinates = new Point3d(-4.67, -3.06, 10.07);

    const marker = new Marker(planeCoordinates, { x: 70, y: 70 });
    marker.label = "Plane";
    marker.setScaleFactor({ low: 1.0, high: 1.0 });
    marker.imageOffset = { x: 0, y: 0 };
    marker.imageSize = { x: 70, y: 70 };
    marker.labelOffset = { x: 0, y: -20 };
    marker.visible = true;

    marker.onMouseButton = (ev) => {
      if (ev.button === 0) { // Detect left mouse button click
        setPopup(true);
        return true; // Indicate that the event has been handled
      }
      return false;
    };

    markers.addMarker(marker);
    IModelApp.viewManager.addDecorator(markers);
  };

  const addFireSafetyMarker = (viewport: ScreenViewport) => {
    const markers = new MyMarkerSet(viewport);
    const fireSafetyCoordinates = new Point3d(70, 0, 0);

    const marker = new Marker(fireSafetyCoordinates, { x: 32, y: 32 });
    marker.label = "Fire Safety";
    marker.setScaleFactor({ low: 1.0, high: 1.0 });
    marker.imageOffset = { x: 0, y: 0 };
    marker.imageSize = { x: 32, y: 32 };
    marker.labelOffset = { x: 0, y: -20 };
    marker.visible = true;

    marker.onMouseButton = (ev) => {
      if (ev.button === 0) { // Left mouse button
        triggerFireAlarm();  // Trigger the fire alarm actions
        return true; // Event handled
      }
      return false; // Event not handled
    };


    markers.addMarker(marker);
    IModelApp.viewManager.addDecorator(markers);
  };

  const addBaggageAreaMarker = (viewport: ScreenViewport, setShowBagScanPopup: React.Dispatch<React.SetStateAction<boolean>>) => {
    const markers = new MyMarkerSet(viewport);
    const baggageAreaCoordinates = new Point3d(65, 35, 0);
    
    const marker = new Marker(baggageAreaCoordinates, { x: 70, y: 70 });
    marker.label = "Baggage Area";
    marker.setScaleFactor({ low: 1.0, high: 1.0 });
    marker.imageOffset = { x: 0, y: 0 };
    marker.imageSize = { x: 70, y: 70 };
    marker.labelOffset = { x: 0, y: -20 };
    marker.visible = true;
  
    // Add event handlers for cursor changes
    marker.onMouseEnter = () => {
      document.body.style.cursor = "pointer"; // Change cursor to pointer
    };
  
    marker.onMouseLeave = () => {
      document.body.style.cursor = "default"; // Reset cursor to default
    };
  
    marker.onMouseButton = (ev) => {
      if (ev.button === 0) { // Left mouse button
        console.log("Baggage Area marker clicked");
        setShowBagScanPopup(true);
        return true; // Event handled
      }
      return false; // Event not handled
    };
  
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
      
      await Visualization.hideHouseExterior(vp, imodel);

      addPlaneMarker(vp, setShowPopup); // Pass setShowPopup to handle the click event
      addFireSafetyMarker(vp);
      addBaggageAreaMarker(vp, setShowBagScanPopup);
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
  }),  // Make sure this closing brace has a comma
  new MeasureToolsUiItemsProvider(),  // Correctly separate items in the array
]}
/>
{showPopup && (
  <TimerPopup
    startTime={10800} // 3 hours in seconds
    onClose={() => setShowPopup(false)}
  />
)}
{showBagScanPopup && (
  <BagScanPopup onClose={() => setShowBagScanPopup(false)} />
)}

      </ThemeProvider>
    </div>
  );
};

export default App;
