import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getToken } from "./api.js";

import AdminLayout from "./layout/AdminLayout.jsx";
import Login from "./pages/Login.jsx";
import Posts from "./pages/Posts.jsx";
import PostEditor from "./pages/PostEditor.jsx";
import Media from "./pages/Media.jsx";
import Comments from "./pages/Comments.jsx";
import Users from "./pages/Users.jsx";
import UserEditor from "./pages/UserEditor.jsx";
import UserPerformance from "./pages/UserPerformance.jsx";
import Categories from "./pages/Categories.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ArticleAnalytics from "./pages/ArticleAnalytics.jsx";
import AdsList from "./pages/AdsList.jsx";
import AdsDashboard from "./pages/AdsDashboard.jsx"; // Old
import AdsDashboardV2 from "./pages/AdsDashboardV2.jsx"; // New Pixel-Based
import AdCampaignDetail from "./pages/AdCampaignDetail.jsx";
import CampaignDetails from "./pages/CampaignDetails.jsx";
import Subscribers from "./pages/Subscribers.jsx";
import Settings from "./pages/Settings.jsx";
import ArticlePreview from "./pages/ArticlePreview.jsx";
import Reels from "./pages/Reels.jsx";
import EditorialStudio from "./pages/EditorialStudio.jsx";
import ResearchCenter from "./pages/ResearchCenter.jsx";
import KnowledgeBase from "./pages/KnowledgeBase.jsx";
import EntityDetail from "./pages/EntityDetail.jsx";
import MediaMonitor from "./pages/MediaMonitor.jsx";
import Dossiers from "./pages/Dossiers.jsx";
import DossierDetail from "./pages/DossierDetail.jsx";
import Topics from "./pages/Topics.jsx";
import TopicDetail from "./pages/TopicDetail.jsx";
import Regions from "./pages/Regions.jsx";

function RequireAuth({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/posts/preview/:slug" element={<RequireAuth><ArticlePreview /></RequireAuth>} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        {/* HOME del admin */}
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard/article/:id" element={<ArticleAnalytics />} />

        <Route path="posts" element={<Posts />} />
        <Route path="posts/new" element={<PostEditor mode="create" />} />
        <Route path="posts/:slug" element={<PostEditor mode="edit" />} />

        <Route path="media" element={<Media />} />
        <Route path="comments" element={<Comments />} />
        <Route path="categories" element={<Categories />} />
        <Route path="reels" element={<Reels />} />
        <Route path="editorial-studio" element={<EditorialStudio />} />
        <Route path="research" element={<ResearchCenter />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="knowledge/entities/:id" element={<EntityDetail />} />
        <Route path="monitor" element={<MediaMonitor />} />
        <Route path="dossiers" element={<Dossiers />} />
        <Route path="dossiers/:id" element={<DossierDetail />} />
        <Route path="topics" element={<Topics />} />
        <Route path="topics/regions" element={<Regions />} />
        <Route path="topics/regions/:slug" element={<Regions />} />
        <Route path="topics/:id" element={<TopicDetail />} />


        <Route path="ads" element={<AdsDashboardV2 />} /> {/* Replaced V1 with V2 default */}
        <Route path="ads/campaign/:id" element={<AdCampaignDetail />} />
        <Route path="ads/legacy" element={<AdsList />} />
        <Route path="ads/dashboard" element={<AdsDashboard />} />
        <Route path="ads/campaigns/:id" element={<CampaignDetails />} />

        <Route path="subscribers" element={<Subscribers />} />
        <Route path="users" element={<Users />} />
        <Route path="users/new" element={<UserEditor mode="create" />} />
        <Route path="users/new" element={<UserEditor mode="create" />} />
        <Route path="users/:id" element={<UserEditor mode="edit" />} />
        <Route path="users/:id/performance" element={<UserPerformance />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

