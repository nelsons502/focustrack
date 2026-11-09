import ReflectView from "../../components/ReflectView";
import "./reflect.css";

export default function ReflectPage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <ReflectView />
    </main>
  );
}
