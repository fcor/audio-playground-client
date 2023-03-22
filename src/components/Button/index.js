import React from "react";
import "./styles.css";

const Button = ({ variant, children, handleClick, className, isDisabled }) => {
  return (
    <button disabled={isDisabled} className={`btn ${className} ${variant}`} onClick={handleClick}>
      {children}
    </button>
  );
};
export default Button;