import React from 'react';

interface LiveActivityCollapseProps {
    expanded: boolean;
    children: React.ReactNode;
    id?: string;
}

/**
 * A turn's folded work. It opens and closes at once: the work above the
 * reader is its own list rows (`timelineRows.ts`), and the list keeps the
 * reader's place when a row above them changes size.
<<<<<<< HEAD
 *
 * Each state is one plain CSS style, and the children are drawn only while
 * open. There is no measured pixel height and no animation frame to lose, so a
 * Suspense hide and reveal that re-renders this region lands on the same open
 * or closed layout it had before.
=======
>>>>>>> bc50ba56a
 */
export function LiveActivityCollapse({ expanded, children, id }: LiveActivityCollapseProps) {
    return (
        <div
            id={id}
            aria-hidden={!expanded}
            inert={!expanded}
            data-live-activity-content="true"
            style={expanded ? undefined : { height: 0, overflow: 'hidden' }}
        >
            {expanded ? children : null}
        </div>
    );
}
