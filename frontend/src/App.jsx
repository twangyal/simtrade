// src/App.js
import Price from './Components/price.jsx';
import SearchBar from './Components/search.jsx';
import DropdownMenu from './Components/dropdown.jsx';
import React, { useEffect, useState } from 'react';

function App() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    // On connection
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };
    
    // On receiving data from server
    ws.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      console.log("Received data:", newData);
      setData(newData);
    };
    
    // On closing connection
    ws.onclose = () => {
      console.log("Disconnected from WebSocket server");
    };
    
    // On error
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, []); // Empty dependency array

  return (
    <div className="App">
      <Price data={data} />
      <DropdownMenu />
      
    </div>
  );
}

export default App;
