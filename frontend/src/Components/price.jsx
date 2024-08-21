import React from 'react';

function Price( data, parentChange ) {
    if (!data || !data.data) {
        return <h1 className="text-center text-gray-500">Loading...</h1>;
    }

    const { symbol, price, bid, ask } = data.data;

    return (
        <div className="p-4 bg-white shadow-md rounded-lg max-w-md mx-auto">
            {data.parentChange !== symbol ? (
                <h1 className="text-center text-gray-500">Connecting...</h1>
            ) : (
                <div className="flex flex-col items-start space-y-2">
                    <div className="flex items-center space-x-4">
                        <h1 className="text-2xl font-semibold text-gray-800">{symbol}</h1>
                        <h2 className="text-xl font-bold text-green-600">{price[0] || price}</h2>
                    </div>
                    <div className="flex flex-col space-y-1">
                        {ask && <h3 className="text-md text-gray-700">Ask: {ask}</h3>}
                        {bid && <h3 className="text-md text-gray-700">Bid: {bid}</h3>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Price;
