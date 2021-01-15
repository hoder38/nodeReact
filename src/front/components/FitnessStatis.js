import React from 'react'
import Chart from 'chart.js'
import Tooltip from './Tooltip.js'
import Dropdown from './Dropdown.js'
import { api, killEvent, resetItemList, getRandomColor } from '../utility.js'

class FitnessStatis extends React.Component {
    constructor(props) {
        super(props);
        this._chart = [null, null, null, null, null];
        this.state = {
            start: '',
        }
    }
    componentDidMount() {
        api('/api/fitness/getStat').then(result => {
            result.chart.forEach((v, i) => {
                if (v) {
                    const color = getRandomColor();
                    this._chart[i] = new Chart(document.getElementById(`chart${i}`), {
                        type: 'line',
                        data: {
                            labels: v.labels,
                            datasets: [{
                                label: v.label,
                                data: v.data,
                                fill: false,
                                borderColor: color,
                                pointBackgroundColor: color,
                                spanGaps: false,
                            }],
                            lineTension: 0.1,
                        },
                        options: {
                            tooltips: {mode: 'index'},
                        },
                    });
                }
            });
            this._dropList = result.fitness.map((v, i) => ({
                title: v.title,
                onclick: index => this._changeChart(index, v.id),
                key: i,
            }));
            this._dropList.push({
                title: '(隱藏)',
                onclick: index => this._changeChart(index),
                key: this._dropList.length,
            });
            this.setState(Object.assign({}, this.state, {start: result.start}));
        }).catch(err => this.props.addalert(err));
    }
    componentWillUnmount() {
        this._chart.forEach(i => {
            if (i) {
                i.destroy();
            }
        });
    }
    _changeChart = (index, id = null) => {
        const str = id ? `${index}/${id}` : index;
        api(`/api/fitness/getStat/${str}`).then(result => {
            if (result['apiOK']) {
                if (this._chart[index]) {
                    this._chart[index].destroy();
                }
            } else {
                const color = getRandomColor();
                this._chart[index] = new Chart(document.getElementById(`chart${index}`), {
                    type: 'line',
                    data: {
                        labels: result.labels,
                        datasets: [{
                            label: result.label,
                            data: result.data,
                            fill: false,
                            borderColor: color,
                            pointBackgroundColor: color,
                            spanGaps: false,
                        }],
                        lineTension: 0.1,
                    },
                    options: {
                        tooltips: {mode: 'index'},
                    },
                });
            }
        }).catch(err => this.props.addalert(err));
    }
    _reset = () => {
        this.props.sendglbcf(() => api('/api/fitness/reset').then(result => {
            resetItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set).catch(err => this.props.addalert(err))
            this.props.basicset(0);
            this.props.onclose();
        }).catch(err => this.props.addalert(err)), `Would you sure to reset fitness date?`);
    }
    render() {
        return (
            <section style={{paddingTop: '50px', overflowX: 'hidden'}} id="stock-info">
                <section className="panel panel-default" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Statistic</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-4">
                                <h3>Start:</h3>
                            </div>
                            <div className="col-md-8">
                                <h3>{this.state.start}</h3>
                            </div>
                        </div>
                    </div>
                </section>
                <section className="panel panel-primary" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Chart 1</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-4">
                                <h3>point:</h3>
                            </div>
                            <div className="col-md-8">
                                <h3>{this.props.point}</h3>
                            </div>
                        </div>
                        <canvas id="chart0"></canvas>
                    </div>
                </section>
                <section className="panel panel-info" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Chart 2</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <Dropdown headelement="span" droplist={this._dropList} param={1}>
                                    <Tooltip tip="更換項目" />
                                    <button type="button" className="btn btn-default">
                                        <span className="caret"></span>
                                    </button>
                                </Dropdown>
                            </div>
                        </div>
                        <canvas id="chart1"></canvas>
                    </div>
                </section>
                <section className="panel panel-warning" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Chart 3</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <Dropdown headelement="span" droplist={this._dropList} param={2}>
                                    <Tooltip tip="更換項目" />
                                    <button type="button" className="btn btn-default">
                                        <span className="caret"></span>
                                    </button>
                                </Dropdown>
                            </div>
                        </div>
                        <canvas id="chart2"></canvas>
                    </div>
                </section>
                <section className="panel panel-danger" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Chart 4</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <Dropdown headelement="span" droplist={this._dropList} param={3}>
                                    <Tooltip tip="更換項目" />
                                    <button type="button" className="btn btn-default">
                                        <span className="caret"></span>
                                    </button>
                                </Dropdown>
                            </div>
                        </div>
                        <canvas id="chart3"></canvas>
                    </div>
                </section>
                <section className="panel panel-success" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Chart 5</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <Dropdown headelement="span" droplist={this._dropList} param={4}>
                                    <Tooltip tip="更換項目" />
                                    <button type="button" className="btn btn-default">
                                        <span className="caret"></span>
                                    </button>
                                </Dropdown>
                            </div>
                        </div>
                        <canvas id="chart4"></canvas>
                    </div>
                </section>
                <button className="btn btn-danger btn-lg" type="button" onClick={e => killEvent(e, this._reset)}>RESET</button>
            </section>
        )
    }
}

export default FitnessStatis
