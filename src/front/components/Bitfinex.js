import React from 'react'
import { RIGHT } from '../constants'
import ReBitfinexCategorylist from '../containers/ReBitfinexCategorylist'

export default function Bitfinex() {
    return (
        <div>
            <ReBitfinexCategorylist collapse={RIGHT} />
        </div>
    )
}