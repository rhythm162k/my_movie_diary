import { Routes, Route } from "react-router";
import HomePage from "./Pages/HomePage/HomePage";
import AddNew from "./Pages/AddNew/AddNew";

function App() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/add-new" element={<AddNew />} />
    </Routes>
  );
}

export default App;
