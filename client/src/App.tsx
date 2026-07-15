import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminPanel from "@/pages/AdminPanel";
import BuyerDashboard from "@/pages/BuyerDashboard";
import BuyerQuotes from "@/pages/BuyerQuotes";
import Home from "@/pages/Home";
import JewellerDashboard from "@/pages/JewellerDashboard";
import JewellerQuotes from "@/pages/JewellerQuotes";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Signup from "@/pages/Signup";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/signup"}>{() => <Signup />}</Route>
      <Route path={"/signup/jeweller"}>{() => <Signup jeweller />}</Route>
      {/* Buyer area */}
      <Route path={"/app"} component={BuyerDashboard} />
      <Route path={"/app/quotes"}>{() => <BuyerQuotes />}</Route>
      <Route path={"/app/requests/:id"}>
        {params => <BuyerQuotes requestId={parseInt(params.id)} />}
      </Route>
      {/* Jeweller area */}
      <Route path={"/jeweller"} component={JewellerDashboard} />
      <Route path={"/jeweller/quotes"} component={JewellerQuotes} />
      {/* Admin area */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
