import { ArrowRight } from "lucide-react";
import { TransitionLink } from "@/components/transition-link";
import styles from "./study-link.module.css";

export function StudyLink({ href, title, question, category, action, compact = false, preview }: {
  href: string;
  title: string;
  question: string;
  category: string;
  action: string;
  compact?: boolean;
  preview?: React.ReactNode;
}) {
  return (
    <TransitionLink href={href} className={`${styles.tile} ${compact ? styles.compact : ""}`}>
      <span className={`mono ${styles.category}`}>{category}</span>
      <span className={styles.arrow} aria-hidden="true"><ArrowRight size={24} /></span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.question}>{question}</p>
      {preview && <div className={styles.preview}>{preview}</div>}
      <span className={styles.action}>{action}</span>
    </TransitionLink>
  );
}
