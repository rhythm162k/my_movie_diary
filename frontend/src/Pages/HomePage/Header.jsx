import LogoutButton from "./LogoutButton";
import "./Header.css";

export default function Header() {
  return (
    <div className="header-element">
      <img src="./app-logo.png" alt="app logo" />
      <LogoutButton />
    </div>
  );
}
