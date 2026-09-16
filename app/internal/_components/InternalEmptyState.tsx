import { Inbox } from "lucide-react";
export default function InternalEmptyState({title,description}:{title:string;description:string}) {
  return <div className="li-empty-state"><span><Inbox size={26} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p></div>;
}
