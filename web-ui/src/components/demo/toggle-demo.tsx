import React, { useState } from "react";
import { Toggle } from "@/components/ui/toggle";

const LockClosedSmall = () => (
  <svg
    height="16"
    strokeLinejoin="round"
    viewBox="0 0 16 16"
    width="16"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9.5 6V7H6.5V6C6.5 5.17157 7.17157 4.5 8 4.5C8.82843 4.5 9.5 5.17157 9.5 6ZM5 7V6C5 4.34315 6.34315 3 8 3C9.65685 3 11 4.34315 11 6V7H12V11.5C12 12.3284 11.3284 13 10.5 13H5.5C4.67157 13 4 12.3284 4 11.5V7H5Z"
    />
  </svg>
);

const LockOpenSmall = () => (
  <svg
    height="16"
    strokeLinejoin="round"
    viewBox="0 0 16 16"
    width="16"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.5 7V6C13.5 5.17157 12.8284 4.5 12 4.5C11.1716 4.5 10.5 5.17157 10.5 6V7H12V8.5V9V11.5C12 12.3284 11.3284 13 10.5 13H5.5C4.67157 13 4 12.3284 4 11.5V7H9V6C9 4.34315 10.3431 3 12 3C13.6569 3 15 4.34315 15 6V7H13.5Z"
    />
  </svg>
);

export const Default = () => {
  const [checked, setChecked] = useState(false);
  const [checked2, setChecked2] = useState(true);

  return (
    <div className="flex flex-col gap-2 p-6">
        <div className="font-bold text-xl dark:text-white">Default</div>
        <Toggle
          aria-label="Enable Firewall"
          checked={checked}
          onChange={(): void => setChecked(!checked)}
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={checked2}
          onChange={(): void => setChecked2(!checked2)}
        />
      </div>
  )
}

export const Disabled = () => {
  return (
    <div className="flex flex-col gap-2 p-6">
        <div className="font-bold text-xl dark:text-white">Disabled</div>
        <Toggle
          aria-label="Enable Firewall"
          checked
          disabled
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={false}
          disabled
        />
      </div>
  )
}

export const Sizes = () => {
  const [checked3, setChecked3] = useState(false);
  const [checked4, setChecked4] = useState(true);

  return (
    <div className="flex flex-col gap-2 p-6">
        <div className="font-bold text-xl dark:text-white">Sizes</div>
        <Toggle
          aria-label="Enable Firewall"
          checked={checked3}
          onChange={(): void => setChecked3(!checked3)}
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={checked4}
          onChange={(): void => setChecked4(!checked4)}
          size="large"
        />
      </div>
  )
}

export const CustomColor = () => {
  const [checked5, setChecked5] = useState(false);

  return (
    <div className="flex flex-col gap-2 p-6">
        <div className="font-bold text-xl dark:text-white">Custom Color</div>
        <Toggle
          aria-label="Enable Firewall"
          checked={checked5}
          color="amber"
          icon={{
            checked: <LockClosedSmall />,
            unchecked: <LockOpenSmall />
          }}
          onChange={(): void => setChecked5(!checked5)}
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={checked5}
          color="red"
          icon={{
            checked: <LockClosedSmall />,
            unchecked: <LockOpenSmall />
          }}
          onChange={(): void => setChecked5(!checked5)}
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={checked5}
          color="amber"
          icon={{
            checked: <LockClosedSmall />,
            unchecked: <LockOpenSmall />
          }}
          onChange={(): void => setChecked5(!checked5)}
          size="large"
        />
        <Toggle
          aria-label="Enable Firewall"
          checked={checked5}
          color="red"
          icon={{
            checked: <LockClosedSmall />,
            unchecked: <LockOpenSmall />
          }}
          onChange={(): void => setChecked5(!checked5)}
          size="large"
        />
      </div>
  )
}

export const WithLabel = () => {
  const [checked6, setChecked6] = useState(false);

  return (
      <div className="flex flex-col gap-2 p-6">
        <div className="font-bold text-xl dark:text-white">With Label</div>
        <div className="flex gap-4">
          <Toggle checked={checked6} onChange={(): void => setChecked6(!checked6)}>
            Enable Firewall
          </Toggle>
          <Toggle
            checked={checked6}
            direction="switch-first"
            onChange={(): void => setChecked6(!checked6)}
          >
            Enable Firewall
          </Toggle>
        </div>
        <div className="flex gap-4">
          <Toggle
            checked={checked6}
            onChange={(): void => setChecked6(!checked6)}
            size="large"
          >
            Enable Firewall
          </Toggle>
          <Toggle
            checked={checked6}
            direction="switch-first"
            onChange={(): void => setChecked6(!checked6)}
            size="large"
          >
            Enable Firewall
          </Toggle>
        </div>
        <div className="flex gap-4">
          <Toggle
            checked={checked6}
            icon={{
              checked: <LockClosedSmall />,
              unchecked: <LockOpenSmall />,
            }}
            onChange={(): void => setChecked6(!checked6)}
          >
            Enable Firewall
          </Toggle>
          <Toggle
            checked={checked6}
            direction="switch-first"
            icon={{
              checked: <LockClosedSmall />,
              unchecked: <LockOpenSmall />,
            }}
            onChange={(): void => setChecked6(!checked6)}
          >
            Enable Firewall
          </Toggle>
        </div>
        <div className="flex gap-4">
          <Toggle
            checked={checked6}
            icon={{
              checked: <LockClosedSmall />,
              unchecked: <LockOpenSmall />,
            }}
            onChange={(): void => setChecked6(!checked6)}
            size="large"
          >
            Enable Firewall
          </Toggle>
          <Toggle
            checked={checked6}
            direction="switch-first"
            icon={{
              checked: <LockClosedSmall />,
              unchecked: <LockOpenSmall />,
            }}
            onChange={(): void => setChecked6(!checked6)}
            size="large"
          >
            Enable Firewall
          </Toggle>
        </div>
      </div>
  );
};
