import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX, LOTTERY } from '../constants.js'
import Categorylist from './Categorylist.js'
import ReLotteryItemlist from '../containers/ReLotteryItemlist.js'
import ReItemInput from '../containers/ReItemInput.js'
import ItemHead from './ItemHead.js'
import { api, isValidString, killEvent } from '../utility.js'

class Lottery extends React.Component {
    constructor(props) {
        super(props);
        this._namelist = [];
        this._id = null;
        this.state = {
            name: false,
            user: {},
            reward: [],
            owner: false,
            list: [],
            rewardName: '',
            nameIndex: -1,
        }
    }
    componentDidMount() {
        api('/api/lottery/get').then(init => {
            if (init.name !== false) {
                document.getElementById('root').addEventListener('lottery', this._ws);
                const user = new Map();
                init.user.forEach(item => user.set(item.id, item));
                this.setState(Object.assign({}, this.state, {
                    name: init.name,
                    user: {
                        list: user,
                        more: false,
                    },
                    reward: init.reward,
                    owner: init.owner,
                }));
            }
        }).catch(err => this.props.addalert(err));
    }
    componentWillUnmount() {
        document.getElementById('root').removeEventListener('lottery', this._ws);
        this.props.lotteryset([], null, null, null, 'name', 'asc')
    }
    _newLottery = () => {
        this.props.globalinput(1, 'New Lottery...', 'danger', (name, exact, type) => isValidString(name, 'name') ? Promise.resolve(this.props.globalinput(2, `${this.props.mainUrl}/upload/lottery/${name}/${(type === '0' || type === '1' || type === '2' || type === '3' || type === '4' || type === '5') ? type : '0'}`, 'danger', () => {
            api('/api/lottery/get').then(init => {
                if (init.name === false) {
                    this.props.addalert('csv parse fail!!!');
                } else {
                    document.getElementById('root').addEventListener('lottery', this._ws);
                    const user = new Map();
                    init.user.forEach(item => user.set(item.id, item));
                    this.setState(Object.assign({}, this.state, {
                        name: init.name,
                        user: {
                            list: user,
                            more: false,
                        },
                        reward: init.reward,
                        owner: init.owner,
                    }));
                }
            });
            return Promise.resolve(this.props.addalert('csv upload success'));
        }, true)) : Promise.reject('Lottery name is not vaild!!!'), null, '0:不可重複得獎, 1:可重複得獎, 2:不刪已得獎,3:不可重複得獎(匿名), 4:可重複得獎(匿名), 5:不刪已得獎(匿名)');
    }
    _ws = e => {
        if (this._id) {
            this._update(this._id);
        }
        this._namelist = e.detail.namelist;
        this._id = e.detail.id;
        this.setState(Object.assign({}, this.state, {
            rewardName: e.detail.rewardName,
            nameIndex: 0,
        }), () => {
            if (this.state.nameIndex + 1 >= this._namelist.length) {
                this._update(this._id);
            }
        });
    }
    _nextName = (all=false) => {
        if (this.state.nameIndex + 1 < this._namelist.length) {
            if (all) {
                this.setState(Object.assign({}, this.state, {
                    nameIndex: this._namelist.length - 1,
                }), () => this._update(this._id));
            } else {
                console.log(this.state.nameIndex);
                this.setState(Object.assign({}, this.state, {
                    nameIndex: this.state.nameIndex + 1,
                }), () => {
                    if (this.state.nameIndex + 1 >= this._namelist.length) {
                        this._update(this._id);
                    }
                });
            }
        }
    }
    _update = id => {
        this._id = null;
        api(`/api/lottery/single/${id}`).then(data => {
            this.props.lotteryset(data.item);
            return api('/api/lottery/userlist')
        }).then(data => {
            const user = new Map();
            data.forEach(item => user.set(item.id, item));
            this.setState(Object.assign({}, this.state, {
                user: {
                    list: user,
                    more: false,
                },
            }));
        }).catch(err => this.props.addalert(err));
    }
    render() {
        const show = (this.state.name === false) ? '' : (this.state.nameIndex > -1) ? `現在是${this.state.name}，恭喜${this._namelist.slice(0, this.state.nameIndex + 1).join('、')}獲得${this.state.rewardName}！！！` : `現在是${this.state.name}`;
        const open = (this.state.nameIndex > -1) ? this._namelist[this.state.nameIndex] : 'The winner is ...';
        const content = this.state.name === false ? (
            <div>
                <ReItemInput />
                <br/>
                請先填寫此次抽獎的名稱及類型，<br/>
                再上傳包含抽獎名單跟獎項的CSV檔及是否是windows上傳
                不能包含，&#34;
                <br/>
                <button className="btn btn-success" type="button" onClick={e => killEvent(e, this._newLottery)}>NEW LOTTERY</button>
            </div>
        ) : (
            <div>
                <Categorylist collapse={RIGHT} setstock={() => this.props.sendglbcf(() => {
                    api(`${this.props.mainUrl}/output/lottery`).then(() => {
                        this.props.lotteryset([], null, null, null, 'name', 'asc')
                        this.setState(Object.assign({}, this.state, {name: false}), () => {
                            document.getElementById('root').removeEventListener('lottery', this._ws);
                            window.location.href = `${this.props.mainUrl}/download/lottery`
                        })
                    }).catch(err => this.props.addalert(err));
                }, `Would you sure to end ${this.state.name}?`)} itemType={LOTTERY} dirs={[]} itemlist={this.state.user} stockopen={this.state.owner} />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <div className="input-group" id="lottery">
                        <span className="input-group-btn">
                            <button className="btn btn-info" type="button" onClick={e => killEvent(e, () => this._nextName(true))}>
                                <i className="glyphicon glyphicon-remove"></i>
                            </button>
                        </span>
                        <input type="text" className="form-control" value={open} disabled={true} />
                        <span className="input-group-btn">
                            <button className="btn btn-info" type="button" onClick={e => killEvent(e, this._nextName)}>
                                <span className="glyphicon glyphicon-chevron-right">
                                </span>
                            </button>
                        </span>
                    </div>
                    <ol className="breadcrumb" style={{marginBottom: '0px', display: 'block', height: '56px'}}>{show}</ol>
                    <ItemHead itemType={LOTTERY} select={new Set()} sortName={'name'} sortType={'asc'} setSelect={() => {}} />
                </section>
                <ReLotteryItemlist itemList={this.state.reward} owner={this.state.owner} />
            </div>
        )
        return content
    }
}

export default Lottery