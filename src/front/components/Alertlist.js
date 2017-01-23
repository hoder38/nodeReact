import React from 'react'
import AlertMsg from './AlertMsg'
import { ALERT_ZINDEX } from '../constants'

export default function Alertlist({ alertlist, onclose }) {
    let rows = []
    alertlist.forEach(alert => rows.push(<AlertMsg key={alert.key} msg={alert.msg} onclose={() => onclose(alert.key)} />))
    return <div style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: ALERT_ZINDEX}}>{rows}</div>
}