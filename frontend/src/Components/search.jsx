import React, {useState} from "react";

const items = [
    "AAPL","INFY","QQQ","IXIC","VFIAX","TRP",
    "EUR/USD","USD/JPY","ETH/BTC","BTC/USD"];

function SearchBar() {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [results, setResults] = useState([]);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        if(value.length>0){
            const filteredResults = items.filter(item =>
                item.toLowerCase().includes(value.toLowerCase())
            );
            setSuggestions(filteredResults);
        }
        else{
            setSuggestions([]);
        }
    }
    
    const selectSuggestion = (value) => {
        setQuery(value);
        setSuggestions([]);
        showResults(value);
    }

    const showResults = (query) => {
        const filteredResults = items.filter(item =>
            item.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filteredResults);
    }

    return (
        <div>
            <div className="search-container">
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder="Search..."
                />
                {suggestions.length > 0 && (
                    <div className="suggestions">
                        {suggestions.map((item, index) => (
                            <div
                                key={index}
                                className="suggestion-item"
                                onClick={() => selectSuggestion(item)}
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div id="search-results">
                {results.map((result, index) => (
                    <div key={index}>{result}</div>
                ))}
            </div>
        </div>
    );
}

export default SearchBar;