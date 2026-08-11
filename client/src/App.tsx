import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminPanel from "@/pages/AdminPanel";
import AdminChatView from "@/pages/AdminChatView";
import BuyerChats from "@/pages/BuyerChats";
import BuyerDashboard from "@/pages/BuyerDashboard";
import BuyerQuotes from "@/pages/BuyerQuotes";
import ChatThreadPage from "@/pages/ChatThread";
import Home from "@/pages/Home";
import JewellerChats from "@/pages/JewellerChats";
import JewellerCredits from "@/pages/JewellerCredits";
import JewellerDashboard from "@/pages/JewellerDashboard";
import JewellerDirectory from "@/pages/JewellerDirectory";
import JewellerLeadDetail from "@/pages/JewellerLeadDetail";
import JewellerProfileEditor from "@/pages/JewellerProfileEditor";
import JewellerPublicProfile from "@/pages/JewellerPublicProfile";
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
      {/* Public jeweller discovery */}
      <Route path={"/jewellers"} component={JewellerDirectory} />
      <Route path={"/j/:slug"}>
        {params => <JewellerPublicProfile slug={params.slug} />}
      </Route>
      {/* Buyer area */}
      <Route path={"/app"} component={BuyerDashboard} />
      <Route path={"/app/quotes"}>{() => <BuyerQuotes />}</Route>
      <Route path={"/app/requests/:id"}>
        {params => <BuyerQuotes requestId={parseInt(params.id)} />}
      </Route>
      <Route path={"/app/chats"} component={BuyerChats} />
      <Route path={"/app/chat/:id"}>
        {params => <ChatThreadPage threadId={parseInt(params.id)} />}
      </Route>
      {/* Jeweller area */}
      <Route path={"/jeweller"} component={JewellerDashboard} />
      <Route path={"/jeweller/quotes"} component={JewellerQuotes} />
      <Route path={"/jeweller/credits"} component={JewellerCredits} />
      <Route path={"/jeweller/profile"} component={JewellerProfileEditor} />
      <Route path={"/jeweller/leads/:id"}>
        {params => <JewellerLeadDetail id={parseInt(params.id)} />}
      </Route>
      <Route path={"/jeweller/chats"} component={JewellerChats} />
      <Route path={"/jeweller/chat/:id"}>
        {params => <ChatThreadPage threadId={parseInt(params.id)} />}
      </Route>
      {/* Admin area */}
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/admin/chat/:id"}>
        {params => <AdminChatView threadId={parseInt(params.id)} />}
      </Route>
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
