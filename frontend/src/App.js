import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Transactions from "@/pages/Transactions";
import Analysis from "@/pages/Analysis";
import NonMoving from "@/pages/NonMoving";
import ImportExport from "@/pages/ImportExport";
import SettingsPage from "@/pages/Settings";
import Reports from "@/pages/Reports";
import Reorder from "@/pages/Reorder";

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/reorder" element={<Reorder />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/non-moving" element={<NonMoving />} />
          <Route path="/import-export" element={<ImportExport />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
