import React from 'react';

const NewsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    strokeWidth="2" 
    stroke="currentColor" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a1 1 0 0 1 1 -1h3" />
    <path d="M18 18v-5a2 2 0 0 0 -2 -2h-4a2 2 0 0 0 -2 2v5" />
    <path d="M7 8h10" />
    <path d="M7 12h4" />
    <path d="M7 16h4" />
  </svg>
);

export default NewsIcon; 