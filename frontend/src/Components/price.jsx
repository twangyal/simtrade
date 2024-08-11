import React, { useEffect, useState } from 'react';

function Price (data) {
  console.log("Received data:", data);
  return (
    <div>
      {data.data.symbol ? <h1>{data.data.symbol}</h1> : <h1>Connecting...</h1>}
      {data.data.price && <h2>{data.data.price}</h2>}
    </div>
  );
};

export default Price;