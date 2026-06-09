import React from "react";
import SmartAdBanner from "./SmartAdBanner";

export default function AdSpot({ position, style }) {
    // Smart Ad Banner - Connected to Ad Manager
    return (
        <div className={`ad-spot ad-${position}`} style={style}>
            <SmartAdBanner position={position} />
        </div>
    );
}
