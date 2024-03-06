import { useState, useEffect } from 'react'
import './App.css'
import tradeList from './tradeList'

function App() {
  const [trades, setTrades] = useState([])
  const [email, setEmail] = useState(existingContact.email||"")

  useEffect(() => {
    fetchTrades()
  }, [])
  const fetchTrades = async () =>{
    const response = await fetch("http://127.0.0.1:5000/trades", "GET")
    const data = await response.json()
    setTrades(data.trades)
    console.log(data.trades)
  }
  /**const tradeLong = async () =>{
    const response = await fetch("http://127.0.0.1:5000/trades", "POST")
    if(response.status !== 201&& response.status !== 200){
      const data = await response.json()
      alert(data.message)
  }else{
      updateCallback()
  }
  }**/
  return (
    <>
      <tradeList trades = {trades}/>
      <button onClick={openCreateModal}>Create new order</button>
    </>
  )
}

export default App
