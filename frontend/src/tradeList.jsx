import React from "react";

function tradeList ({trades}){
    return(
        <div>
            <h1>Trades</h1>
            <table>
                <thead>
                    <tr>
                        <td>Time</td>
                        <td>Ticker</td>
                        <td>Long or Short</td>
                    </tr>
                </thead>
                <tbody>
                {trades.map((trade)=>(
                    <tr key={trade.id}>
                        <td>{trade.time}</td>
                        <td>{trade.instrument}</td>
                        <td>{trade.buy_or_sell}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}

export default tradeList;