import { Link } from "react-router-dom";
import { EmptyState, PageHeader } from "../components/ui";

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Not found" back />
      <EmptyState
        title="This page does not exist"
        description="The link may be outdated or the course was removed."
        action={
          <Link to="/" className="btn-primary btn-sm">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
