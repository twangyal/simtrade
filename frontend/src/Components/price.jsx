import React, { useEffect, useState } from 'react';

function Price ( data, parentChange) {
    if (!data || !data.data) {
    return <h1>Loading...</h1>;
  }
  return (
    <div>
      {data.parentChange !== data.data.symbol ? (
        <h1>Connecting...</h1>
      ) : (
        <>
          <h1>{data.data.symbol}</h1>
          {data.data.price[0] ? <h2>{data.data.price[0]}</h2>: <h2>{data.data.price}</h2>}
          {data.data.price[1] ? <h3>{data.data.price[1]}</h3>: data.data.ask && <h3>{data.data.ask}</h3>}
          {data.data.price[2] ? <h3>{data.data.price[2]}</h3>: data.data.bid && <h3>{data.data.bid}</h3>}
        </>
      )}
    </div>
  );
};

export default Price;