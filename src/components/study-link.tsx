import { ArrowRight } from "lucide-react";
import { TransitionLink } from "@/components/transition-link";
import styles from "./study-link.module.css";

export function StudyLink({ href, title, question, category, action }: {
  href: string;
  title: string;
  question: string;
  category: string;
  action: string;
}) {
  return (
    <TransitionLink href={href} className={styles.tile}>
      <span className={`mono ${styles.category}`}>{category}</span>
      <span className={styles.arrow} aria-hidden="true"><ArrowRight size={24} /></span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.question}>{question}</p>
      <span className={styles.action}>{action}</span>
    </TransitionLink>
  );
}
