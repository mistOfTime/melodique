// This route redirects to the main album page
import { redirect } from "next/navigation";

export default function AlbumsRedirect({ params }: { params: { id: string } }) {
  redirect(`/album/${params.id}`);
}
