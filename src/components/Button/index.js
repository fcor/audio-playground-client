import React from "react";
import "./styles.css";

const Button = ({ variant, children, handleClick, className }) => {
  return (
    <button className={`btn ${className} ${variant}`} onClick={handleClick}>
      {children}
    </button>
  );
};
export default Button;