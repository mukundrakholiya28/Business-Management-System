import { PageSkeleton } from "@/components/ui";
import Navbar from "@/components/Navbar";
export default function CustomersLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <PageSkeleton variant="customers" />
    </div>
  );
}
