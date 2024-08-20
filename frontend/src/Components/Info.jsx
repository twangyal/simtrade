// src/App.js
import Price from './Price.jsx';
import React, { useEffect, useState, useRef } from 'react';

function Info({instrumentSelect}) {
  const [data, setData] = useState([]);
  const parentChange = useRef(instrumentSelect);

  useEffect(() => {
    parentChange.current = instrumentSelect;
  }, [instrumentSelect]);
  
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    // On connection
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };
    
    // On receiving data from server
    ws.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      if (newData.symbol === parentChange.current) {
        setData(newData);
      }
    };
    
    // On closing connection
    ws.onclose = () => {
      console.log("Disconnected from WebSocket server");
    };
    
    // On error
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, []);
  return (
    
    <div>
    <h1>Trading App</h1>
    <div className="App">
      <h1>Instrument: {parentChange.current}</h1>
      <Price data={data} parentChange={parentChange.current} />
    </div>
  </div>
  );
}

export default Info;
