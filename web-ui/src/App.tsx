import { SignIn1 } from "@/components/ui/modern-stunning-sign-in";
import "./style.css";

function App() {
  const handleSignIn = (email: string, password: string) => {
    console.log("Sign in:", email, password);
  };
  const handleGoogleSignIn = () => {
    console.log("Google sign in");
  };
  const handleSignUp = () => {
    console.log("Sign up");
  };

  return (
    <div className="min-h-screen bg-black">
      <SignIn1
        onSignIn={handleSignIn}
        onGoogleSignIn={handleGoogleSignIn}
        onSignUp={handleSignUp}
      />
    </div>
  );
}

export default App;
