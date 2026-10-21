import { ArrowRight } from "lucide-react";
import { TransitionLink } from "@/components/transition-link";
import styles from "./study-link.module.css";

export function StudyLink({ href, title, question, mobileQuestion, category, action, compact = false, mobileCompact = false, preview, heading: Heading = "h2" }: {
  href: string;
  title: string;
  question: string;
  mobileQuestion?: string;
  category: string;
  action: string;
  compact?: boolean;
  mobileCompact?: boolean;
  preview?: React.ReactNode;
  heading?: "h2" | "h3";
}) {
  return (
    <TransitionLink href={href} className={`${styles.tile} ${compact ? styles.compact : ""} ${mobileCompact ? styles.mobileCompact : ""}`}>
      <span className={`mono ${styles.category}`}>{category}</span>
      <span className={styles.arrow} aria-hidden="true"><ArrowRight size={24} /></span>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.question}>{mobileQuestion ? <>
        <span className={styles.desktopQuestion}>{question}</span>
        <span className={styles.mobileQuestion}>{mobileQuestion}</span>
      </> : question}</p>
      {preview && <div className={styles.preview}>{preview}</div>}
      <span className={styles.action}>{action}</span>
    </TransitionLink>
  );
}
