import React from 'react'

export default function WidgetButton({ name, show, progress, buttonType, widget, more=false }) {
    const button = `btn btn-${buttonType}`
    const showWidget = show ? {} : {display: 'none'}
    return (
        <button type="button" className={button} style={showWidget} data-widget={widget}>
            {name}<span className="badge">{more ? '>' : ''}{progress}</span>
        </button>
    )
}
