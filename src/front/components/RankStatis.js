import React from 'react'
import { FILE_ZINDEX } from '../constants.js'
import Chart from 'chart.js'
import { killEvent, getRandomColor } from '../utility.js'

function getRankColor(len, own) {
    let bg = [];
    let br = [];
    const color = getRandomColor(0.2);
    for (let i = 0; i < len; i++) {
        if (i === own) {
            bg.push('rgba(255, 99, 132, 0.2)');
            br.push('rgb(255, 99, 132)');
        } else if (i == len - 1) {
            bg.push('rgba(255, 205, 86, 0.2)');
            br.push('rgb(255, 205, 86)');
        } else if (i == len - 2) {
            bg.push('rgba(201, 203, 207, 0.2)');
            br.push('rgb(201, 203, 207)');
        } else if (i == len - 3) {
            bg.push('rgba(255, 159, 64, 0.2)');
            br.push('rgb(255, 159, 64)');
        } else {
            bg.push(color[0]);
            br.push(color[1]);
        }
    }
    return {bg, br};
}

class RankStatis extends React.Component {
    constructor(props) {
        super(props);
    }
    componentDidMount() {
        const color = getRankColor(this.props.item.labels.length, this.props.item.owner);
        this._chart = new Chart(document.getElementById('chart'), {
            type: 'bar',
            data: {
                labels: this.props.item.labels,
                datasets: [{
                    label: this.props.item.itemName,
                    data: this.props.item.data,
                    fill: false,
                    backgroundColor: color.bg,
                    borderColor: color.br,
                    borderWidth: 1,
                }],
            },
            options: {scales: {yAxes:[{ticks:{beginAtZero:true}}]}},
        });
    }
    componentWillUnmount() {
        this._chart.destroy();
    }
    render() {
        return (
            <div className="modal-content" style={{
                position: 'fixed',
                zIndex: FILE_ZINDEX,
            }} id="password-section">
                <div className="modal-body panel panel-info" style={{
                    padding: '0px',
                    marginBottom: '0px',
                }}>
                    <div className="panel-heading" onClick={e => killEvent(e, this.props.onclose)}>
                        <h3 className="panel-title">{this.props.item.name}<i className="pull-right glyphicon glyphicon-remove"></i></h3>
                    </div>
                    <div className="panel-body">
                        <canvas id="chart"></canvas>
                    </div>
                </div>
            </div>
        )
    }
}

export default RankStatis