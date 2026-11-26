import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { applyTelegramTheme } from "./lib/telegram";
import { HomePage } from "./pages/HomePage";
import { CoursePage } from "./pages/CoursePage";
import { EntityPage } from "./pages/EntityPage";
import { ProgramPage } from "./pages/ProgramPage";
import { WriteReviewPage } from "./pages/WriteReviewPage";
import { MyReviewsPage } from "./pages/MyReviewsPage";
import { RewardsPage } from "./pages/RewardsPage";
import { VerifyPage } from "./pages/VerifyPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminRewardsPage } from "./pages/AdminRewardsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { GuidelinesPage } from "./pages/GuidelinesPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  useEffect(() => {
    applyTelegramTheme();
  }, []);

  return (
    <AuthProvider>
      <AuthGate>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/course/:code" element={<CoursePage />} />
            <Route path="/program/:code" element={<ProgramPage />} />
            <Route path="/club/:code" element={<EntityPage type="club" />} />
            <Route path="/campus/:code" element={<EntityPage type="place" />} />
            <Route path="/write/:targetType/:code" element={<WriteReviewPage />} />
            <Route path="/my-reviews" element={<MyReviewsPage />} />
            <Route path="/rewards" element={<RewardsPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/rewards" element={<AdminRewardsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/guidelines" element={<GuidelinesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthGate>
    </AuthProvider>
  );
}
