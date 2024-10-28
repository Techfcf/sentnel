import { useState, useRef, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  FeatureGroup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { EditControl } from "react-leaflet-draw";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import omnivore from "leaflet-omnivore";
import JSZip from "jszip";
import evalscripts from "./assets/evalscripts.json";

function ImageLayer({ imageUrl, aoiBounds }) {
  const map = useMap();
  if (imageUrl && aoiBounds) {
    map.fitBounds(aoiBounds);
  }

  return imageUrl && aoiBounds ? (
    <ImageOverlay url={imageUrl} bounds={aoiBounds} />
  ) : null;
}

export default function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [aoiBounds, setAoiBounds] = useState(null);
  const [startDate, setStartDate] = useState(new Date("2023-10-01"));
  const [endDate, setEndDate] = useState(new Date("2023-10-31"));
  const [geojson, setGeojson] = useState(null);
  const [selectedEvalscript, setSelectedEvalscript] = useState(0);
  const [accessToken, setAccessToken] = useState("");
  const featureGroupRef = useRef(null);
  const mapRef = useRef(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const fetchAccessToken = async () => {
      try {
        const response = await fetch("https://backend.fitclimate.com/auth/get-token", {
          method: "GET",
        });
        const data = await response.json();
        setAccessToken(data.token);
      } catch (error) {
        console.error("Error fetching access token:", error);
      }
    };

    fetchAccessToken();
  }, []);

  const getImage = async () => {
    if (!geojson || !accessToken) {
      console.error("No AOI defined or access token missing.");
      return;
    }

    try {
      const response = await fetch(
        "https://services.sentinel-hub.com/api/v1/process",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            input: {
              bounds: {
                geometry: geojson.geometry,
                properties: {
                  crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
                },
              },
              data: [
                {
                  type: "sentinel-2-l2a",
                  dataFilter: {
                    timeRange: {
                      from: startDate.toISOString(),
                      to: endDate.toISOString(),
                    },
                  },
                },
              ],
              output: {
                width: 512,
                height: 512,
              },
            },
            evalscript: evalscripts.evalscripts[selectedEvalscript].script,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Error fetching image: " + response.statusText);
      }

      const imageBlob = await response.blob();
      const imageUrl = URL.createObjectURL(imageBlob);
      setImageUrl(imageUrl);
    } catch (error) {
      console.error("Error fetching image:", error);
    }
  };

  const handleDrawCreate = (e) => {
    const layer = e.layer;
    const shape = layer.toGeoJSON();
    const { coordinates } = shape.geometry;

    const [[minLng, minLat], [maxLng, maxLat]] = coordinates[0].reduce(
      ([min, max], [lng, lat]) => [
        [Math.min(min[0], lng), Math.min(min[1], lat)],
        [Math.max(max[0], lng), Math.max(max[1], lat)],
      ],
      [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ]
    );

    setAoiBounds([
      [minLat, minLng],
      [maxLat, maxLng],
    ]);
    setGeojson(shape);
  };

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
  };

  const handleFileSubmit = async () => {
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      const fileContent = e.target.result;

      let bounds;
      if (file.type === "application/vnd.google-earth.kml+xml") {
        const kmlLayer = omnivore.kml.parseString(fileContent);
        kmlLayer.addTo(mapRef.current);
        bounds = kmlLayer.getBounds();
        setGeojson(kmlLayer.toGeoJSON());
      } else if (
        file.type === "application/json" ||
        file.type === "application/geo+json"
      ) {
        const geojsonLayer = L.geoJSON(JSON.parse(fileContent));
        geojsonLayer.addTo(mapRef.current);
        bounds = geojsonLayer.getBounds();
        setGeojson(JSON.parse(fileContent));
      } else if (file.type === "application/zip") {
        const zip = new JSZip();
        const content = await zip.loadAsync(file);
        const promises = Object.keys(content.files).map(async (filename) => {
          const fileData = await content.files[filename].async("text");
          if (filename.endsWith(".kml")) {
            const kmlLayer = omnivore.kml.parseString(fileData);
            kmlLayer.addTo(mapRef.current);
            return kmlLayer.getBounds();
          } else if (
            filename.endsWith(".geojson") ||
            filename.endsWith(".json")
          ) {
            const geojsonLayer = L.geoJSON(JSON.parse(fileData));
            geojsonLayer.addTo(mapRef.current);
            return geojsonLayer.getBounds();
          }
          return null;
        });

        const boundsArray = await Promise.all(promises);
        bounds = boundsArray.filter(Boolean);
        if (bounds.length > 0) {
          bounds = bounds.reduce((prev, curr) => prev.extend(curr));
        }
      } else {
        console.log("Unsupported file type.");
      }

      if (bounds) {
        mapRef.current.fitBounds(bounds);
      }
    };

    fileReader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-red-500 font-bold">Start Date:</label>
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date)}
            dateFormat="yyyy-MM-dd"
            className="border border-gray-300 rounded-lg p-2"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-blue-500 font-bold">End Date:</label>
          <DatePicker
            selected={endDate}
            onChange={(date) => setEndDate(date)}
            dateFormat="yyyy-MM-dd"
            className="border border-gray-300 rounded-lg p-2"
          />
        </div>
        <button
          onClick={getImage}
          className="mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full"
        >
          Fetch Image
        </button>
      </div>

      <div className="flex flex-col mb-4">
        <label className="font-bold">Upload KML/GeoJSON/JSON/ZIP File:</label>
        <div className="flex items-center">
          <input
            type="file"
            accept=".kml,.geojson,.json,.zip"
            onChange={handleFileUpload}
            className="border border-gray-300 rounded-lg p-2"
          />
          <button
            onClick={handleFileSubmit}
            className="ml-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-full"
          >
            Submit
          </button>
        </div>
      </div>

      <div className="flex w-full">
        <div className="flex flex-col gap-4 w-1/3 overflow-y-auto h-[500px]">
          {evalscripts.evalscripts.map((_, index) => (
            <button
              key={index}
              onClick={() => setSelectedEvalscript(index)}
              className="flex items-center bg-green-100 hover:bg-green-200 text-black font-bold py-2 px-4 rounded-lg"
            >
              <img
                className="w-20 h-20 mr-2 rounded-full"
                src={evalscripts.evalscripts[index].image}
                alt=""
              />
              {evalscripts.evalscripts[index].name}
            </button>
          ))}
        </div>

        <MapContainer
          ref={mapRef}
          center={[0, 0]}
          zoom={2}
          style={{ width: "100%", height: "500px" }}
          className="w-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FeatureGroup ref={featureGroupRef}>
            <EditControl
              position="topright"
              onCreated={handleDrawCreate}
              draw={{
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
              }}
            />
          </FeatureGroup>
          <ImageLayer imageUrl={imageUrl} aoiBounds={aoiBounds} />
        </MapContainer>
      </div>
    </div>
  );
}
