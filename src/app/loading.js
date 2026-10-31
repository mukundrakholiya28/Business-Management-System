// Root loading shell — pre-rendered statically, cached by the service worker
// so the app skeleton is available offline before data loads from IndexedDB.
import { PageSkeleton } from "@/components/ui";
import Navbar from "@/components/Navbar";

export default function RootLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <PageSkeleton variant="dashboard" />
    </div>
  );
}
