import { sampleProject } from "@/data/sample-project";
import { Workspace } from "./workspace";

export default function Home() {
  return <Workspace initialProjects={[sampleProject]} />;
}
