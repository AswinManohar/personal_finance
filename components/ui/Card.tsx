import React from 'react';
import { Card as HeroUICard } from '@heroui/react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, description }) => {
  return (
    <HeroUICard className={`bg-transparent border border-zinc-200 dark:border-zinc-900 shadow-none radius-none rounded-none ${className}`}>
      {(title || description) && (
        <HeroUICard.Header className="flex flex-col items-start px-6 py-4 border-b border-zinc-200 dark:border-zinc-900 rounded-none bg-metric-gradient">
          {title && <h3 className="text-xs uppercase tracking-widest font-bold text-black dark:text-white">{title}</h3>}
          {description && <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mt-1">{description}</p>}
        </HeroUICard.Header>
      )}
      <HeroUICard.Content className="p-6 rounded-none">
        {children}
      </HeroUICard.Content>
    </HeroUICard>
  );
};