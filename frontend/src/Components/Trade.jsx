import React from "react";
import { useEffect, useState } from "react";
import axios from "axios";
import Info from "./Info";
import DropdownMenu from "./Dropdown.jsx";  

function Trade() {
    return(
        <div>
            <DropdownMenu />
            <Info/>
        </div>
        
    );
}

export default Trade;