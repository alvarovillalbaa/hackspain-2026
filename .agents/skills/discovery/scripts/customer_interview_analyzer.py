#!/usr/bin/env python3
"""
Customer Interview Analyzer
Extracts insights, patterns, and opportunities from user interviews
"""

import re
from typing import Dict, List, Set
from collections import Counter, defaultdict
import json


class InterviewAnalyzer:
    """Analyze customer interviews for insights and patterns"""

    def __init__(self):
        # Pain point indicators
        self.pain_indicators = [
            'frustrat', 'annoy', 'difficult', 'hard', 'confus', 'slow',
            'problem', 'issue', 'struggle', 'challeng', 'pain', 'waste',
            'manual', 'repetitive', 'tedious', 'boring', 'time-consuming',
            'complicated', 'complex', 'unclear', 'wish', 'need', 'want'
        ]

        # Positive indicators
        self.delight_indicators = [
            'love', 'great', 'awesome', 'amazing', 'perfect', 'easy',
            'simple', 'quick', 'fast', 'helpful', 'useful', 'valuable',
            'save', 'efficient', 'convenient', 'intuitive', 'clear'
        ]

        # Feature request indicators
        self.request_indicators = [
            'would be nice', 'wish', 'hope', 'want', 'need', 'should',
            'could', 'would love', 'if only', 'it would help', 'suggest',
            'recommend', 'idea', 'what if', 'have you considered'
        ]

        # Jobs to be done patterns
        self.jtbd_patterns = [
            r'when i\s+(.+?),\s+i want to\s+(.+?)\s+so that\s+(.+)',
            r'i need to\s+(.+?)\s+because\s+(.+)',
            r'my goal is to\s+(.+)',
            r'i\'m trying to\s+(.+)',
            r'i use \w+ to\s+(.+)',
            r'helps me\s+(.+)',
        ]

    def analyze_interview(self, text: str) -> Dict:
        """Analyze a single interview transcript"""
        text_lower = text.lower()
        sentences = self._split_sentences(text)

        return {
            'pain_points': self._extract_pain_points(sentences),
            'delights': self._extract_delights(sentences),
            'feature_requests': self._extract_requests(sentences),
            'jobs_to_be_done': self._extract_jtbd(text_lower),
            'sentiment_score': self._calculate_sentiment(text_lower),
            'key_themes': self._extract_themes(text_lower),
            'quotes': self._extract_key_quotes(sentences),
            'metrics_mentioned': self._extract_metrics(text),
            'competitors_mentioned': self._extract_competitors(text)
        }

    def _split_sentences(self, text: str) -> List[str]:
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]

    def _extract_pain_points(self, sentences: List[str]) -> List[Dict]:
        pain_points = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            for indicator in self.pain_indicators:
                if indicator in sentence_lower:
                    pain_points.append({
                        'quote': sentence,
                        'indicator': indicator,
                        'severity': self._assess_severity(sentence_lower)
                    })
                    break
        return pain_points[:10]

    def _extract_delights(self, sentences: List[str]) -> List[Dict]:
        delights = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            for indicator in self.delight_indicators:
                if indicator in sentence_lower:
                    delights.append({
                        'quote': sentence,
                        'indicator': indicator,
                        'strength': self._assess_strength(sentence_lower)
                    })
                    break
        return delights[:10]

    def _extract_requests(self, sentences: List[str]) -> List[Dict]:
        requests = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            for indicator in self.request_indicators:
                if indicator in sentence_lower:
                    requests.append({
                        'quote': sentence,
                        'type': self._classify_request(sentence_lower),
                        'priority': self._assess_request_priority(sentence_lower)
                    })
                    break
        return requests[:10]

    def _extract_jtbd(self, text: str) -> List[Dict]:
        jobs = []
        for pattern in self.jtbd_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                job = ' -> '.join(match) if isinstance(match, tuple) else match
                jobs.append({'job': job, 'pattern': pattern})
        return jobs[:5]

    def _calculate_sentiment(self, text: str) -> Dict:
        positive_count = sum(1 for ind in self.delight_indicators if ind in text)
        negative_count = sum(1 for ind in self.pain_indicators if ind in text)

        total = positive_count + negative_count
        sentiment_score = (positive_count - negative_count) / total if total else 0

        if sentiment_score > 0.3:
            label = 'positive'
        elif sentiment_score < -0.3:
            label = 'negative'
        else:
            label = 'neutral'

        return {
            'score': round(sentiment_score, 2),
            'label': label,
            'positive_signals': positive_count,
            'negative_signals': negative_count
        }

    def _extract_themes(self, text: str) -> List[str]:
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
            'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
            'shall', 'it', 'i', 'you', 'we', 'they', 'them', 'their'
        }
        words = re.findall(r'\b[a-z]{4,}\b', text)
        meaningful = [w for w in words if w not in stop_words]
        freq = Counter(meaningful)
        return [word for word, count in freq.most_common(10) if count >= 3]

    def _extract_key_quotes(self, sentences: List[str]) -> List[str]:
        scored = []
        for sentence in sentences:
            if not (20 <= len(sentence) <= 200):
                continue
            score = 0
            sl = sentence.lower()
            if any(ind in sl for ind in self.pain_indicators):
                score += 2
            if any(ind in sl for ind in self.request_indicators):
                score += 2
            if 'because' in sl:
                score += 1
            if 'but' in sl:
                score += 1
            if '?' in sentence:
                score += 1
            if score > 0:
                scored.append((score, sentence))
        scored.sort(reverse=True)
        return [s[1] for s in scored[:5]]

    def _extract_metrics(self, text: str) -> List[str]:
        metrics = []
        metrics.extend(re.findall(r'\d+%', text))
        metrics.extend(re.findall(r'\d+\s*(?:hours?|minutes?|days?|weeks?|months?)', text, re.IGNORECASE))
        metrics.extend(re.findall(r'\$[\d,]+', text))
        return list(set(metrics))[:10]

    def _extract_competitors(self, text: str) -> List[str]:
        patterns = [
            r'(?:use|used|using|tried|trying|switch from|switched from|instead of)\s+(\w+)',
            r'(\w+)\s+(?:is better|works better|is easier)',
            r'compared to\s+(\w+)',
            r'similar to\s+(\w+)',
        ]
        competitors: Set[str] = set()
        for pattern in patterns:
            competitors.update(re.findall(pattern, text, re.IGNORECASE))
        common_words = {'this', 'that', 'it', 'them', 'other', 'another', 'something'}
        return [c for c in competitors if c.lower() not in common_words and len(c) > 2][:5]

    def _assess_severity(self, text: str) -> str:
        if any(w in text for w in ['very', 'extremely', 'really', 'totally', 'completely']):
            return 'high'
        if any(w in text for w in ['somewhat', 'bit', 'little', 'slightly']):
            return 'low'
        return 'medium'

    def _assess_strength(self, text: str) -> str:
        if any(w in text for w in ['absolutely', 'definitely', 'really', 'very']):
            return 'strong'
        return 'moderate'

    def _classify_request(self, text: str) -> str:
        if any(w in text for w in ['ui', 'design', 'look', 'color', 'layout']):
            return 'ui_improvement'
        if any(w in text for w in ['feature', 'add', 'new', 'build']):
            return 'new_feature'
        if any(w in text for w in ['fix', 'bug', 'broken', 'work']):
            return 'bug_fix'
        if any(w in text for w in ['faster', 'slow', 'performance', 'speed']):
            return 'performance'
        return 'general'

    def _assess_request_priority(self, text: str) -> str:
        if any(w in text for w in ['critical', 'urgent', 'asap', 'immediately', 'blocking']):
            return 'critical'
        if any(w in text for w in ['need', 'important', 'should', 'must']):
            return 'high'
        if any(w in text for w in ['nice', 'would', 'could', 'maybe']):
            return 'low'
        return 'medium'


def format_single_interview(analysis: Dict) -> str:
    """Format single interview analysis for display"""
    output = ["=" * 60, "CUSTOMER INTERVIEW ANALYSIS", "=" * 60]

    sentiment = analysis['sentiment_score']
    output.append(f"\nOverall Sentiment: {sentiment['label'].upper()}")
    output.append(f"   Score: {sentiment['score']}  |  "
                  f"Positive signals: {sentiment['positive_signals']}  |  "
                  f"Negative signals: {sentiment['negative_signals']}")

    if analysis['pain_points']:
        output.append("\nPain Points Identified:")
        for i, pain in enumerate(analysis['pain_points'][:5], 1):
            output.append(f"\n{i}. [{pain['severity'].upper()}] {pain['quote'][:120]}")

    if analysis['feature_requests']:
        output.append("\nFeature Requests:")
        for i, req in enumerate(analysis['feature_requests'][:5], 1):
            output.append(f"\n{i}. [{req['type']}] Priority: {req['priority']}")
            output.append(f"   \"{req['quote'][:120]}\"")

    if analysis['jobs_to_be_done']:
        output.append("\nJobs to Be Done:")
        for i, job in enumerate(analysis['jobs_to_be_done'], 1):
            output.append(f"{i}. {job['job']}")

    if analysis['key_themes']:
        output.append("\nKey Themes:")
        output.append(", ".join(analysis['key_themes']))

    if analysis['quotes']:
        output.append("\nKey Quotes:")
        for i, quote in enumerate(analysis['quotes'][:3], 1):
            output.append(f'{i}. "{quote}"')

    if analysis['metrics_mentioned']:
        output.append("\nMetrics Mentioned:")
        output.append(", ".join(analysis['metrics_mentioned']))

    if analysis['competitors_mentioned']:
        output.append("\nCompetitors Mentioned:")
        output.append(", ".join(analysis['competitors_mentioned']))

    return "\n".join(output)


def main():
    import sys
    import argparse

    parser = argparse.ArgumentParser(
        description="Customer Interview Analyzer — extracts pain points, feature requests, JTBD patterns, "
                    "sentiment, themes, and key quotes from an interview transcript."
    )
    parser.add_argument("file", nargs="?", help="Interview transcript text file to analyze")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    args = parser.parse_args()

    if not args.file:
        print("Usage: python customer_interview_analyzer.py <interview_file.txt> [--json]")
        print("\nExtracts from the transcript:")
        print("  - Pain points with severity")
        print("  - Feature requests with priority")
        print("  - Jobs to be done")
        print("  - Sentiment analysis")
        print("  - Key themes and quotes")
        sys.exit(1)

    with open(args.file, 'r') as f:
        text = f.read()

    analyzer = InterviewAnalyzer()
    analysis = analyzer.analyze_interview(text)

    if args.json:
        print(json.dumps(analysis, indent=2))
    else:
        print(format_single_interview(analysis))


if __name__ == "__main__":
    main()
