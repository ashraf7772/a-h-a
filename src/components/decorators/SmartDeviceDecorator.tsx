import { QueryRowFormat } from "@itwin/core-common";
import { DecorateContext, Decorator, IModelConnection, Marker, ScreenViewport } from "@itwin/core-frontend";

export class SmartDeviceDecorator implements Decorator {
  private _iModel: IModelConnection;
  private _markerSet: Marker[];

  // Hardcoded ID and coordinates for the specific element
  private readonly HARD_CODED_ID = '3259120';
  private readonly COORDINATES = {
    x: 114.6131, // Specific x coordinate
    y: 50.8122,  // Specific y coordinate
    z: 30.8884   // Specific z coordinate
  };

  constructor(vp: ScreenViewport) {
    this._iModel = vp.iModel;
    this._markerSet = [];
    this.addMarkers();
  }

  private async getElementData() {
    // Query to fetch elements where UserLabel matches 'A_Platform.dgn.i.dgn'
    const query = `SELECT ECInstanceId, UserLabel 
                    FROM BisCore.Element 
                    WHERE UserLabel = 'A_Platform.dgn.i.dgn'`;

    const results = this._iModel.query(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
    const values = [];

    for await (const row of results) {
      values.push(row);
    }

    return values;
  }

  private async fetchSpatialData(ecInstanceId: string) {
    // For the specific ID, return hardcoded coordinates
    if (ecInstanceId === this.HARD_CODED_ID) {
      return this.COORDINATES;
    }

    // If not the hardcoded ID, return placeholder or empty coordinates
    return { x: 0, y: 0, z: 0 };
  }

  private async addMarkers() {
    const elements = await this.getElementData();

    for (const element of elements) {
      // Fetch spatial data for the current element
      const spatialData = await this.fetchSpatialData(element.ECInstanceId);

      // Check if spatial data is available (if needed)
      if (!spatialData) {
        console.error(`No spatial data found for element with ID: ${element.ECInstanceId}`);
        continue;
      }

      const smartDeviceMarker = new Marker(
        { x: spatialData.x, y: spatialData.y, z: spatialData.z }, // Use actual coordinates from spatialData
        { x: 50, y: 50 } // Marker size
      );

      const htmlElement = document.createElement("div");
      htmlElement.innerHTML = `
        <h3>${element.UserLabel}</h3>
      `;

      smartDeviceMarker.htmlElement = htmlElement;

      this._markerSet.push(smartDeviceMarker);
    }
  }

  public decorate(context: DecorateContext): void {
    this._markerSet.forEach(marker => {
      marker.addDecoration(context);
    });
  }
}
