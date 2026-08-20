import FutboboShell from "./components/shell/FutboboShell";

// A rota raiz só monta o shell; criação, saves e carreira ficam nos módulos de domínio.
export default function HomePage() {
  return <FutboboShell />;
}
