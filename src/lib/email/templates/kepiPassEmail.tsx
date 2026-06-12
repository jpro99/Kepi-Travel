import { createElement } from 'react';

// Placeholder for KepiPassEmail
export function KepiPassEmail(props: { recipientEmail: string; passId: string; passType: string; redeemUrl: string; }) {
  return createElement('div', null, 
    `Hello ${props.recipientEmail}, you have received a ${props.passType} Kepi Pass! Redeem it here: ${props.redeemUrl}`
  );
}