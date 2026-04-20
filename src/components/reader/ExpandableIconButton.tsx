import {
  forwardRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react";

type ExpandableIconButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    labelDirection: "left" | "right";
  }
>;

export const ExpandableIconButton = forwardRef<
  HTMLButtonElement,
  ExpandableIconButtonProps
>(function ExpandableIconButton(
  { label, labelDirection, className, children, type = "button", ...props },
  ref
) {
  const resolvedAriaLabel = props["aria-label"] ?? label;
  const classes = ["btn", "btn-ghost", "expandable-icon-button", className]
    .filter(Boolean)
    .join(" ");

  const labelNode = (
    <span className="expandable-icon-button__label" aria-hidden="true">
      {label}
    </span>
  );

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={resolvedAriaLabel}
      className={classes}
      data-label-direction={labelDirection}
    >
      {labelDirection === "left" ? labelNode : null}
      <span className="expandable-icon-button__icon" aria-hidden="true">
        {children}
      </span>
      {labelDirection === "right" ? labelNode : null}
    </button>
  );
});
