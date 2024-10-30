import { useState, useRef } from "react";
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
import evalscripts from "./assets/evalscripts.json";
import * as omnivore from "leaflet-omnivore";
import JSZip from "jszip";
import L from "leaflet";

const myevscript = evalscripts;

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
  const featureGroupRef = useRef(null);
  const mapRef = useRef(null);
  const [file, setFile] = useState(null);

  async function getToken() {
    const url = "https://backend.fitclimate.com/auth/get-token";
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      const json = await response.json();
      const token = json.access_token;
      console.log(token);
      return token;
    } catch (error) {
      console.error(error);
    }
  }

  const getImage = async () => {
    if (!geojson) {
      console.error("No AOI defined. Please draw an area on the map.");
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch(
        "https://services.sentinel-hub.com/api/v1/process",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
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
            evalscript: myevscript.evalscripts[selectedEvalscript].script,
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
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
  };

  const handleFileSubmit = async () => {
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      const fileContent = e.target?.result;

      let bounds;
      if (file.type === "application/vnd.google-earth.kml+xml") {
        const kmlLayer = omnivore.kml.parse(fileContent);
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
            const kmlLayer = omnivore.kml.parse(fileData);
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
        bounds = boundsArray.filter(Boolean).reduce((prev, curr) => prev.extend(curr));
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
    <div className="bg-blue-200">
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
            <label className="text-red-500 font-bold">End Date:</label>
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
      </div>
      <div className="flex w-full">
        <div className="flex flex-col gap-4 w-1/3 overflow-y-auto h-[500px]">
          {myevscript.evalscripts.map((_, index) => (
            <button
              key={index}
              onClick={() => setSelectedEvalscript(index)}
              className="flex items-center bg-green-100 hover:bg-green-200 text-black font-bold py-2 px-4 rounded-lg"
            >
              <img
                className="w-20 h-20 mr-4"
                src={myevscript.evalscripts[index].image}
                alt={myevscript.evalscripts[index].name}
              />
              {myevscript.evalscripts[index].name}
            </button>
          ))}
        </div>
        <div className="flex flex-col w-full h-screen">
            <MapContainer
              center={[46.07136085454608, 14.190902709960938]}
              zoom={10}
              style={{ height: "80vh", width: "100%" }} // Use viewport height for better responsiveness
              className="rounded-[8px]"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ImageLayer imageUrl={imageUrl} aoiBounds={aoiBounds} />
              <FeatureGroup ref={featureGroupRef}>
                <EditControl
                  position="topright"
                  onCreated={handleDrawCreate}
                  draw={{
                    rectangle: true,
                    polygon: true,
                    polyline: true,
                    circle: true,
                    circlemarker: true,
                    marker: true,
                  }}
                />
              </FeatureGroup>
            </MapContainer>
        </div>
      </div>
    </div>
  );
}
