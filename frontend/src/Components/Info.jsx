import Price from './Price.jsx';
import React, { useEffect, useState, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

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

    return () => {
      ws.close();
    };
  }, []);
  const graphOptions = {
    title: {
      text: `Price Trend for ${parentChange.current}`
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: 'Price'
      }
    },
    series: [{
      name: parentChange.current,
      data: data.prices || [],  // Assuming data contains an array of prices
      color: '#4A90E2',
    }]
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="App">
        <h2 className="text-lg font-semibold mb-2">Instrument: {parentChange.current}</h2>
        <Price data={data} parentChange={parentChange.current} />
      </div>
      {/* Graph Component */}
      <div className="mt-6">
        <HighchartsReact highcharts={Highcharts} options={graphOptions} />
      </div>
    </div>
  );
}

export default Info;
