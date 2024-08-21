import React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

const PerformanceGraph = () => {
    const options = {
        title: {
            text: 'Portfolio Performance'
        },
        xAxis: {
            categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        },
        yAxis: {
            title: {
                text: 'Portfolio Value ($)'
            }
        },
        series: [{
            name: 'Portfolio',
            data: [70000, 75000, 72000, 80000, 85000, 90000, 95000, 98000, 99000, 105000, 107000, 110000],
            color: '#4A90E2'
        }]
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <HighchartsReact highcharts={Highcharts} options={options} />
        </div>
    );
};

export default PerformanceGraph;
