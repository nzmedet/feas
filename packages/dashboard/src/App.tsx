import { HeroUIProvider } from "@heroui/react";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardProvider } from "./context/DashboardContext";
import { BuildsPage } from "./pages/BuildsPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { DoctorPage } from "./pages/DoctorPage";
import { LogsPage } from "./pages/LogsPage";
import { MetadataPage } from "./pages/MetadataPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { SubmissionsPage } from "./pages/SubmissionsPage";

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "builds", element: <BuildsPage /> },
      { path: "releases", element: <ReleasesPage /> },
      { path: "submissions", element: <SubmissionsPage /> },
      { path: "doctor", element: <DoctorPage /> },
      { path: "metadata", element: <MetadataPage /> },
      { path: "credentials", element: <CredentialsPage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <HeroUIProvider>
      <div className="dark min-h-screen bg-[#070b12] text-slate-100" data-theme="dark">
        <DashboardProvider>
          <RouterProvider router={router} />
        </DashboardProvider>
      </div>
    </HeroUIProvider>
  );
}
