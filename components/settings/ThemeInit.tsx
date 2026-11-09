import { THEME_KEY } from "./theme";

const themeInitScript = `try{const choice=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(choice==="light"||choice==="dark")document.documentElement.dataset.theme=choice}catch{}`;

export default function ThemeInit() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}
