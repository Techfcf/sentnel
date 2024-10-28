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

  const getImage = async () => {
    if (!geojson) {
      console.error("No AOI defined. Please draw an area on the map.");
      return;
    }

    try {
      const response = await fetch(
        "https://services.sentinel-hub.com/api/v1/process",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ3dE9hV1o2aFJJeUowbGlsYXctcWd4NzlUdm1hX3ZKZlNuMW1WNm5HX0tVIn0.eyJleHAiOjE3MzAxMDA0NzAsImlhdCI6MTczMDA5Njg3MCwianRpIjoiY2ZhODdkZTItZWZjZC00NWQ4LWJkMzYtNjg1ODQ0MjI4ZDFkIiwiaXNzIjoiaHR0cHM6Ly9zZXJ2aWNlcy5zZW50aW5lbC1odWIuY29tL2F1dGgvcmVhbG1zL21haW4iLCJzdWIiOiJlMzczZTI2OS0xYTAzLTRlMGEtYWU5NC1lMDMyMTUyODlkMzUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJjYjllZTY4My01YTMyLTQ1ODgtOTZlMy1jYTY0YmQ3NzY2MzIiLCJzY29wZSI6ImVtYWlsIHByb2ZpbGUiLCJjbGllbnRIb3N0IjoiMTU3LjM1LjQyLjE2MyIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoic2VydmljZS1hY2NvdW50LWNiOWVlNjgzLTVhMzItNDU4OC05NmUzLWNhNjRiZDc3NjYzMiIsImNsaWVudEFkZHJlc3MiOiIxNTcuMzUuNDIuMTYzIiwiYWNjb3VudCI6IjExODM3ZjQxLTYyNDYtNDc0Ny04MGVjLWE0OTYwODIzZDQ2ZCIsImNsaWVudF9pZCI6ImNiOWVlNjgzLTVhMzItNDU4OC05NmUzLWNhNjRiZDc3NjYzMiJ9.ZepQZ32hXcRy-TFilMHITNQn-2QSP9oFLUCBDmvKrQAzUuyjGBsmRnBmfe82EDq51xN7OiBD2QocDtPDbYRBqUZFmrPCboTp1vO9Mo6lf1y8_D2RDCEubowXfE-mseroOYAfR97YCKqEWhtjvRctBoBTlYyrF0zG7pgico0IyiQozdJeb87VjaWtlArqG8xA7nlUBgzbGyRCtClblNA2C7GZoHpwrn4z0ZJqIwdRPXaQN_OPnWcTds4ewzVI08jgHqkWr4KBJhCEibDq_K4oq-SCpnQQwN2-6jvQPFhqkiN2QIOuRitgct_i3erDMbI_zeAHXg2bPM8Biq4Ne0awmw", // Replace <YOUR_ACCESS_TOKEN> with your actual token
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

      <div className="flex w-full">
        {/* Evalscript Selection with Scroll */}
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

        {/* Map Container */}
        <div className="w-2/3 ml-4">
          <MapContainer
            center={[46.07136085454608, 14.190902709960938]}
            zoom={10}
            style={{ height: "500px", width: "100%" }}
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
                  circle: true,
                  marker: true,
                  polyline: true,
                  circlemarker: true,
                }}
              />
            </FeatureGroup>
          </MapContainer>
        </div>
      </div>

      {/* Fetch Image Button */}

    </div>
  );
}
